//! Shared completion lifecycle for native UI writes and MCP mutations.
//! Keep recurrence dates and deterministic IDs aligned with taskRecurrence.js.
use chrono::{Datelike, Days, Local, NaiveDate};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

fn date(value: &str) -> Option<NaiveDate> {
    if value.len() != 10 || value.starts_with("0000") {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|day| day.format("%Y-%m-%d").to_string() == value)
}
fn id(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}
fn completed(task: &Value) -> bool {
    task["status"] != "abandoned" && (task["done"] == true || task["status"] == "done")
}
fn supported(task: &Value) -> bool {
    matches!(
        task["repeat"].as_str(),
        Some("每天" | "每周一" | "每周" | "每月")
    )
}
fn anchor_day(task: &Value, source: NaiveDate) -> u32 {
    if task["recurrenceScheduledDate"] == task["date"] {
        if let Some(day) = task["recurrenceDay"]
            .as_u64()
            .filter(|d| (1..=31).contains(d))
        {
            return day as u32;
        }
    }
    source.day()
}
fn month_day(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
    let month_index = year * 12 + month as i32 - 1;
    let year = month_index.div_euclid(12);
    let month = month_index.rem_euclid(12) as u32 + 1;
    if !(1..=9999).contains(&year) {
        return None;
    }
    (1..=day)
        .rev()
        .find_map(|day| NaiveDate::from_ymd_opt(year, month, day))
}
fn next_date(task: &Value, today: NaiveDate) -> Option<NaiveDate> {
    let source = task["date"].as_str().and_then(date).unwrap_or(today);
    let next = match task["repeat"].as_str()? {
        "每月" => {
            let offset = ((today.year() - source.year()) * 12 + today.month() as i32
                - source.month() as i32)
                .max(1) as u32;
            let day = anchor_day(task, source);
            let candidate = month_day(source.year(), source.month() + offset, day)?;
            if candidate < today {
                month_day(candidate.year(), candidate.month() + 1, day)?
            } else {
                candidate
            }
        }
        "每周一" => {
            let offset = 7 - source.weekday().num_days_from_monday() as u64;
            let candidate = source.checked_add_days(Days::new(offset))?;
            if candidate < today {
                candidate.checked_add_days(Days::new(
                    ((today - candidate).num_days() as u64).div_ceil(7) * 7,
                ))?
            } else {
                candidate
            }
        }
        "每天" | "每周" => {
            let interval: i64 = if task["repeat"] == "每周" { 7 } else { 1 };
            let elapsed = (today - source).num_days().max(0);
            let count = ((elapsed + interval - 1) / interval).max(1);
            source.checked_add_days(Days::new((count * interval) as u64))?
        }
        _ => return None,
    };
    (next.year() <= 9999).then_some(next)
}
fn child_id(root: &Value, index: u64) -> String {
    let encoded = id(root)
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("recurrence:{encoded}:{index}")
}
fn reset_subtasks(items: &Value, parent: &str) -> Value {
    Value::Array(
        items
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
            .map(|(index, value)| {
                let mut task = if let Some(title) = value.as_str() {
                    json!({"title":title})
                } else if value.is_object() {
                    value.clone()
                } else {
                    json!({})
                };
                let id = format!("{parent}:sub:{index}");
                task["id"] = json!(id);
                task["done"] = json!(false);
                if task.get("status").is_some() {
                    task["status"] = json!("pending");
                }
                task.as_object_mut().unwrap().remove("completedAt");
                if task["subtasks"].is_array() {
                    task["subtasks"] = reset_subtasks(&task["subtasks"], &id);
                }
                task
            })
            .collect(),
    )
}
fn next_reminder(task: &Value, source: NaiveDate, target: NaiveDate) -> String {
    let Some(reminder) = task["reminder"].as_str() else {
        return String::new();
    };
    // The editor stores local minute precision. Preserve seconds / offsets from imported records too.
    if reminder.len() < 16
        || !reminder.is_ascii()
        || reminder.as_bytes()[10] != b'T'
        || reminder.as_bytes()[13] != b':'
    {
        return String::new();
    }
    let Some(day) = date(&reminder[..10]) else {
        return String::new();
    };
    let valid_local = chrono::NaiveDateTime::parse_from_str(reminder, "%Y-%m-%dT%H:%M").is_ok()
        || chrono::NaiveDateTime::parse_from_str(reminder, "%Y-%m-%dT%H:%M:%S%.f").is_ok()
        || chrono::DateTime::parse_from_rfc3339(reminder).is_ok();
    if !valid_local {
        return String::new();
    }
    let Some(moved) = day
        .checked_add_signed(target - source)
        .filter(|day| (1..=9999).contains(&day.year()))
    else {
        return String::new();
    };
    format!("{}{}", moved.format("%Y-%m-%d"), &reminder[10..])
}

pub(crate) fn apply(previous: &Value, next: &Value) -> Value {
    apply_at(
        previous,
        next,
        Local::now().date_naive(),
        Local::now().timestamp_millis(),
    )
}
fn apply_at(previous: &Value, next: &Value, today: NaiveDate, now: i64) -> Value {
    let Some(tasks) = next["tasks"].as_array() else {
        return next.clone();
    };
    let before: HashMap<_, _> = previous["tasks"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|task| (id(&task["id"]), task))
        .collect();
    let mut ids: HashSet<_> = tasks.iter().map(|task| id(&task["id"])).collect();
    let mut additions = Vec::new();
    let result: Vec<_> = tasks
        .iter()
        .map(|input| {
            let mut task = input.clone();
            let Some(before) = before.get(&id(&task["id"])) else {
                return task;
            };
            if before["recurrenceNextId"]
                .as_str()
                .is_some_and(|value| !value.is_empty())
            {
                task["recurrenceNextId"] = before["recurrenceNextId"].clone();
            }
            if completed(before)
                || before["deleted"] == true
                || !completed(&task)
                || task["deleted"] == true
                || task["recurrenceNextId"]
                    .as_str()
                    .is_some_and(|value| !value.is_empty())
                || !supported(&task)
            {
                return task;
            }
            let Some(next_date) = next_date(&task, today) else {
                return task;
            };
            let root = if !task["recurrenceRootId"].is_null() {
                task["recurrenceRootId"].clone()
            } else {
                json!(id(&task["id"]))
            };
            let index = task["recurrenceIndex"]
                .as_u64()
                .filter(|index| *index <= 9_007_199_254_740_991)
                .unwrap_or(0)
                + 1;
            let next_id = child_id(&root, index);
            task["recurrenceNextId"] = json!(next_id);
            if ids.contains(&next_id) {
                return task;
            }
            let source = task["date"].as_str().and_then(date).unwrap_or(today);
            let mut child = task.clone();
            for field in [
                "recurrenceNextId",
                "completedAt",
                "deletedAt",
                "abandonedAt",
            ] {
                child.as_object_mut().unwrap().remove(field);
            }
            child["id"] = json!(next_id);
            child["date"] = json!(next_date.format("%Y-%m-%d").to_string());
            child["done"] = json!(false);
            child["status"] = json!("pending");
            child["deleted"] = json!(false);
            child["createdAt"] = json!(now);
            child["subtasks"] = reset_subtasks(&task["subtasks"], &next_id);
            child["recurrenceRootId"] = root;
            child["recurrenceIndex"] = json!(index);
            child["recurrenceDay"] = json!(anchor_day(&task, source));
            child["recurrenceScheduledDate"] = child["date"].clone();
            child["reminder"] = json!(next_reminder(&task, source, next_date));
            child["reminderNotified"] = json!("");
            child["reminderAcknowledged"] = json!("");
            ids.insert(next_id);
            additions.push(child);
            task
        })
        .collect();
    additions.extend(result);
    let mut data = next.clone();
    data["tasks"] = json!(additions);
    data
}

#[cfg(test)]
mod tests {
    use super::*;
    fn run(before: &Value, next: &Value, today: &str) -> Value {
        apply_at(before, next, date(today).unwrap(), 100)
    }
    fn done(task: &Value, today: &str) -> Value {
        let mut next = task.clone();
        next["done"] = json!(true);
        next["status"] = json!("done");
        run(&json!({"tasks":[task]}), &json!({"tasks":[next]}), today)
    }
    #[test]
    fn completion_preserves_extras_and_resets_nested_subtasks_and_reminders() {
        let original = json!({"id":"欢迎","date":"2026-09-13","repeat":"每天","done":false,"custom":{"keep":true},"subtasks":["legacy",{"id":"sub","title":"item","done":true,"note":"keep","subtasks":[{"done":true}]}],"reminder":"2026-09-12T09:00","reminderNotified":"old","reminderAcknowledged":"old","completedAt":1});
        let next = done(&original, "2026-09-13");
        let child = &next["tasks"][0];
        assert_eq!(child["id"], "recurrence:e6aca2e8bf8e:1");
        assert_eq!(child["date"], "2026-09-14");
        assert_eq!(child["custom"], original["custom"]);
        assert_eq!(child["subtasks"][1]["note"], "keep");
        assert_eq!(child["subtasks"][1]["done"], false);
        assert_eq!(child["subtasks"][1]["subtasks"][0]["done"], false);
        assert_eq!(child["reminder"], "2026-09-13T09:00");
        assert_eq!(child["reminderNotified"], "");
        assert!(child.get("completedAt").is_none());
        assert_eq!(next["tasks"][1]["recurrenceNextId"], child["id"]);
        assert_eq!(
            done(child, "2026-09-14")["tasks"][0]["id"],
            "recurrence:e6aca2e8bf8e:2"
        );
    }
    #[test]
    fn monthly_anchor_survives_leap_and_short_months_and_respects_manual_schedule_edit() {
        for (year, feb) in [(2024, 29), (2025, 28)] {
            let january =
                json!({"id":12,"date":format!("{year}-01-31"),"repeat":"每月","done":false});
            let next = done(&january, &format!("{year}-01-31"));
            let february = &next["tasks"][0];
            assert_eq!(february["date"], format!("{year}-02-{feb}"));
            assert_eq!(
                done(february, &format!("{year}-02-{feb}"))["tasks"][0]["date"],
                format!("{year}-03-31")
            );
            let mut changed = february.clone();
            changed["date"] = json!(format!("{year}-02-20"));
            assert_eq!(
                done(&changed, &format!("{year}-02-20"))["tasks"][0]["date"],
                format!("{year}-03-20")
            );
        }
    }
    #[test]
    fn daily_weekly_and_monday_skip_missed_dates_but_keep_cadence() {
        for (rule, source, today, expected) in [
            ("每天", "2026-08-01", "2026-09-13", "2026-09-13"),
            ("每周", "2026-09-01", "2026-09-13", "2026-09-15"),
            ("每周一", "2026-09-07", "2026-09-14", "2026-09-14"),
            ("每周一", "2026-09-14", "2026-09-14", "2026-09-21"),
            ("每月", "2024-01-31", "2026-09-13", "2026-09-30"),
            ("每天", "", "2026-09-13", "2026-09-14"),
            ("每天", "2027-01-01", "2026-09-13", "2027-01-02"),
        ] {
            assert_eq!(
                next_date(&json!({"repeat":rule,"date":source}), date(today).unwrap())
                    .unwrap()
                    .format("%Y-%m-%d")
                    .to_string(),
                expected
            );
        }
        assert!(next_date(
            &json!({"repeat":"每天","date":"9999-12-31"}),
            date("9999-12-31").unwrap()
        )
        .is_none());
    }
    #[test]
    fn undo_recomplete_and_deleted_successor_do_not_regenerate_or_overwrite_user_edits() {
        let original = json!({"id":"root","date":"2026-09-13","repeat":"每天","done":false});
        let first = done(&original, "2026-09-13");
        let mut undo = first.clone();
        undo["tasks"][0]["title"] = json!("edited");
        undo["tasks"][1]["done"] = json!(false);
        undo["tasks"][1]["status"] = json!("pending");
        let mut redo = undo.clone();
        redo["tasks"][1]["done"] = json!(true);
        let result = run(&undo, &redo, "2026-09-13");
        assert_eq!(result["tasks"].as_array().unwrap().len(), 2);
        assert_eq!(result["tasks"][0]["title"], "edited");
        let mut stale = original.clone();
        stale["done"] = json!(false);
        let erased = run(&first, &json!({"tasks":[stale]}), "2026-09-13");
        assert_eq!(
            done(&erased["tasks"][0], "2026-09-13")["tasks"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        // A concurrent deterministic child already present is authoritative.
        let collision = run(&json!({"tasks":[original]}), &redo, "2026-09-13");
        assert_eq!(collision["tasks"].as_array().unwrap().len(), 2);
        assert_eq!(collision["tasks"][0]["title"], "edited");
    }
    #[test]
    fn abandonment_trash_and_completed_imports_never_backfill() {
        let task = json!({"id":1,"date":"2026-09-13","repeat":"每天","done":false});
        for updated in [
            json!({"done":true,"status":"abandoned"}),
            json!({"done":true,"deleted":true}),
            json!({"done":false,"status":"in-progress"}),
        ] {
            let mut next = task.clone();
            for (key, value) in updated.as_object().unwrap() {
                next[key] = value.clone();
            }
            assert_eq!(
                run(
                    &json!({"tasks":[task]}),
                    &json!({"tasks":[next]}),
                    "2026-09-13"
                )["tasks"]
                    .as_array()
                    .unwrap()
                    .len(),
                1
            );
        }
        let mut abandoned = task.clone();
        abandoned["done"] = json!(true);
        abandoned["status"] = json!("abandoned");
        assert_eq!(
            done(&abandoned, "2026-09-13")["tasks"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let mut historical = task.clone();
        historical["done"] = json!(true);
        assert_eq!(
            run(
                &json!({"tasks":[]}),
                &json!({"tasks":[historical]}),
                "2026-09-13"
            )["tasks"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            done(&historical, "2026-09-13")["tasks"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
}
