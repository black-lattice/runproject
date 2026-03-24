use super::types::AgentSession;
use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

lazy_static! {
    pub static ref SESSIONS: Arc<Mutex<HashMap<String, AgentSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}
