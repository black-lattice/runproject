use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    response::Response,
    routing::any,
    Router,
};
use http_body_util::BodyExt;
use reqwest::{Client, cookie::Jar};
use std::sync::Arc;

#[derive(Clone)]
pub struct ProxyState {
    target_url: String,
    cookie_jar: Arc<Jar>,
}

impl ProxyState {
    pub fn new(target_url: String) -> Self {
        println!("[Proxy] Target: {}", target_url);
        Self {
            target_url,
            cookie_jar: Arc::new(Jar::default()),
        }
    }
}

// 代理处理器
async fn proxy_handler(
    State(state): State<ProxyState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Body,
) -> Result<Response, StatusCode> {
    // 获取请求路径
    let path = uri.path().trim_start_matches('/');
    
    // 构建目标 URL
    let target_url = if path.is_empty() {
        state.target_url.clone()
    } else {
        format!("{}/{}", state.target_url.trim_end_matches('/'), path)
    };

    // 添加查询参数
    let target_url = if let Some(query) = uri.query() {
        format!("{}?{}", target_url, query)
    } else {
        target_url
    };

    println!("[Proxy] {} -> {}", method, target_url);

    // 创建带 Cookie Jar 的 Client
    let client = Client::builder()
        .danger_accept_invalid_certs(true)
        .cookie_store(true)
        .cookie_provider(state.cookie_jar.clone())
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| {
            eprintln!("[Proxy] Failed to create client: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 构建请求
    let mut request = client.request(method.clone(), &target_url);

    // 复制请求头（排除特定头）
    for (key, value) in headers.iter() {
        let key_str = key.as_str().to_lowercase();
        if !["host", "connection", "content-length", "origin", "referer"].contains(&key_str.as_str()) {
            if let Ok(value_str) = value.to_str() {
                request = request.header(key.as_str(), value_str);
            }
        }
    }

    // 添加正确的 Host 头
    if let Ok(url) = reqwest::Url::parse(&target_url) {
        if let Some(host) = url.host_str() {
            request = request.header("Host", host);
        }
    }

    // 添加请求体
    let body_bytes = body
        .collect()
        .await
        .map_err(|e| {
            eprintln!("[Proxy] Failed to read request body: {}", e);
            StatusCode::BAD_REQUEST
        })?
        .to_bytes();

    if !body_bytes.is_empty() {
        request = request.body(body_bytes.to_vec());
    }

    // 发送请求
    let response = request.send().await.map_err(|e| {
        eprintln!("[Proxy] Request failed: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    // 构建响应
    let status = response.status();
    let response_headers = response.headers().clone();
    let body_bytes = response.bytes().await.map_err(|e| {
        eprintln!("[Proxy] Failed to read response body: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let mut builder = Response::builder().status(status);

    // 处理 OPTIONS 预检请求
    if method == Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "http://localhost:1420")
            .header("Access-Control-Allow-Credentials", "true")
            .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
            .header("Access-Control-Allow-Headers", "*")
            .header("Access-Control-Max-Age", "3600")
            .body(Body::empty())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    // 复制响应头（排除 CORS 头，由代理统一设置）
    for (key, value) in response_headers.iter() {
        let key_str = key.as_str().to_lowercase();
        if !["content-length", "transfer-encoding", "connection",
             "access-control-allow-origin", 
             "access-control-allow-credentials",
             "access-control-allow-methods", 
             "access-control-allow-headers",
             "access-control-max-age",
             "access-control-expose-headers"
        ].contains(&key_str.as_str()) {
            builder = builder.header(key, value);
        }
    }

    // 添加 CORS 头
    builder = builder
        .header("Access-Control-Allow-Origin", "http://localhost:1420")
        .header("Access-Control-Allow-Credentials", "true")
        .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
        .header("Access-Control-Allow-Headers", "*");

    builder
        .body(Body::from(body_bytes))
        .map_err(|e| {
            eprintln!("[Proxy] Failed to build response: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

pub async fn start_proxy_server(
    port: u16,
    target_url: String,
) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let state = ProxyState::new(target_url);

    let app = Router::new()
        .route("/", any(proxy_handler))
        .route("/*path", any(proxy_handler))
        .with_state(state);

    // 尝试绑定端口，如果失败则尝试其他端口
    let mut actual_port = port;
    let listener = loop {
        match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", actual_port)).await {
            Ok(listener) => break listener,
            Err(_) => {
                if actual_port < port + 10 {
                    eprintln!("[Proxy] Port {} is in use, trying {}...", actual_port, actual_port + 1);
                    actual_port += 1;
                } else {
                    return Err(format!("无法启动代理服务器：端口 {}-{} 都被占用", port, actual_port).into());
                }
            }
        }
    };

    println!("✅ Proxy server started on http://127.0.0.1:{}", actual_port);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("❌ Proxy server error: {}", e);
        }
    });

    Ok(actual_port)
}

#[tauri::command]
pub async fn start_proxy_server_command(
    port: u16,
    target_url: String,
) -> Result<u16, String> {
    start_proxy_server(port, target_url)
        .await
        .map_err(|e| e.to_string())
}
