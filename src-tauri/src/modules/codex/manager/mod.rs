pub mod actions;
pub mod commands;
pub mod discovery;
pub mod mcp;
pub mod tools;
pub mod utils;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;
use super::session::CodexSession;

lazy_static! {
    pub(crate) static ref SESSIONS: Arc<Mutex<HashMap<String, CodexSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

pub use commands::*;