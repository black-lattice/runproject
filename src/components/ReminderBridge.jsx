import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductivityData } from "@/store/dataSync";
import {
  newReminders,
  reminderSnapshot,
  claimReminderNotifications,
  watchReminderClock,
} from "@/utils/taskReminders";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Lives beside the router, so task reminders continue when another page is open.
export default function ReminderBridge() {
  const { tasks, setTasks, syncStatus } = useProductivityData();
  const [now, setNow] = useState(Date.now);
  const { toast } = useToast();
  const navigate = useNavigate();
  useEffect(() => watchReminderClock(setNow), []);
  useEffect(() => {
    if (document.hidden || ["loading", "error", "saving"].includes(syncStatus))
      return;
    const keys = reminderSnapshot(newReminders(tasks, Date.now()));
    if (!keys.size) return;
    let due = [];
    // The external store updater is synchronous. Recheck against its current
    // snapshot so replayed effects or a concurrent edit cannot claim twice.
    setTasks((current) => {
      const claimed = claimReminderNotifications(current, keys, Date.now());
      due = claimed.notifications;
      return claimed.tasks;
    });
    if (!due.length) return;
    toast({
      title: due.length === 1 ? "任务到期提醒" : `${due.length} 个任务到期`,
      description: due
        .slice(0, 3)
        .map((task) => task.title)
        .join("、"),
      action: (
        <ToastAction
          altText="查看到期任务"
          onClick={() => navigate("/welcome?notifications=1")}
        >
          查看
        </ToastAction>
      ),
    });
  }, [tasks, now, syncStatus, setTasks, toast, navigate]);
  return null;
}
