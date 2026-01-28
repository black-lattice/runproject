use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;
use super::types::AgentSession;

lazy_static! {
    pub static ref SESSIONS: Arc<Mutex<HashMap<String, AgentSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}
