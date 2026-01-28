use std::collections::HashMap;

pub fn default_auto_approve() -> HashMap<String, bool> {
    let mut map = HashMap::new();
    map.insert("write".to_string(), false);
    map.insert("delete".to_string(), false);
    map.insert("mkdir".to_string(), false);
    map.insert("move".to_string(), false);
    map.insert("batch".to_string(), false);
    map
}
