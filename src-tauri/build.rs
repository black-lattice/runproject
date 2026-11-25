fn main() {
    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/updater/sparkle.m");
        cc::Build::new()
            .file("src/updater/sparkle.m")
            .flag("-fobjc-arc")
            .compile("runproject_sparkle");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
