//! Apply only fields changed since the caller's snapshot. Same-field writes are
//! last-writer-wins; removal of a keyed entity wins over stale edits to it.
use serde_json::{Map, Value};

fn key(value: &Value, field: &str) -> String {
    match field {
        "tasks" | "subtasks" => value["id"].to_string(),
        "lists" => value[0].to_string(),
        _ => value["path"].to_string(),
    }
}

pub(crate) fn merge(base: &Value, local: &Value, remote: &Value, field: &str) -> Value {
    if base == local {
        return remote.clone();
    }
    if let (Some(b), Some(l), Some(r)) = (base.as_object(), local.as_object(), remote.as_object()) {
        let mut result = r.clone();
        for k in b.keys().chain(l.keys()) {
            if b.get(k) == l.get(k) {
                continue;
            }
            if let Some(v) = l.get(k) {
                result.insert(
                    k.clone(),
                    merge(
                        b.get(k).unwrap_or(&Value::Null),
                        v,
                        r.get(k).unwrap_or(&Value::Null),
                        k,
                    ),
                );
            } else {
                result.remove(k);
            }
        }
        return Value::Object(result);
    }
    if matches!(
        field,
        "tasks" | "lists" | "workspaces" | "projects" | "subtasks"
    ) {
        if let (Some(b), Some(l), Some(r)) = (base.as_array(), local.as_array(), remote.as_array())
        {
            if field == "lists" && b.iter().chain(l).chain(r).any(|v| !v.is_array()) {
                return local.clone();
            }
            let index = |items: &[Value]| -> Map<String, Value> {
                items.iter().map(|v| (key(v, field), v.clone())).collect()
            };
            let bm = index(b);
            let lm = index(l);
            let rm = index(r);
            // Preserve caller ordering for existing rows, append concurrent additions.
            let mut result = Vec::new();
            for item in l {
                let k = key(item, field);
                match (bm.get(&k), rm.get(&k)) {
                    (Some(before), Some(current)) => result.push(merge(before, item, current, "")),
                    (None, current) => {
                        result.push(current.cloned().unwrap_or_else(|| item.clone()))
                    }
                    (Some(_), None) => {}
                }
            }
            for item in r {
                let k = key(item, field);
                if !bm.contains_key(&k) && !lm.contains_key(&k) {
                    result.push(item.clone());
                }
            }
            return Value::Array(result);
        }
    }
    local.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn preserves_external_additions_and_status_during_ui_edit() {
        let base = json!({"tasks":[{"id":1,"title":"old","done":false}],"lists":[]});
        let mut local = base.clone();
        local["tasks"][0]["title"] = json!("edited");
        let remote = json!({"tasks":[{"id":1,"title":"old","done":true},{"id":"mcp","title":"new"}],"lists":[["新清单","0"]]});
        let result = merge(&base, &local, &remote, "");
        assert_eq!(
            result["tasks"][0],
            json!({"id":1,"title":"edited","done":true})
        );
        assert_eq!(result["tasks"].as_array().unwrap().len(), 2);
        assert_eq!(result["lists"], remote["lists"]);
    }
    #[test]
    fn stale_edit_does_not_resurrect_deleted_workspace() {
        let base = json!({"workspaces":[{"path":"/a","name":"a"}],"projectTags":{}});
        let local = json!({"workspaces":[{"path":"/a","name":"b"}],"projectTags":{"/b":["tag"]}});
        let remote = json!({"workspaces":[],"projectTags":{"/c":["other"]}});
        let result = merge(&base, &local, &remote, "");
        assert_eq!(result["workspaces"], json!([]));
        assert_eq!(result["projectTags"], json!({"/b":["tag"],"/c":["other"]}));
    }
}
