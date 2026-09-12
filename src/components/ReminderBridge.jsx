import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductivityData } from "@/store/dataSync";
import {
  newReminders,
  reminderKey,
  markRemindersNotified,
} from "@/utils/taskReminders";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Lives beside the router, so task reminders continue when another page is open.
export default function ReminderBridge() {
  const { tasks, setTasks, syncStatus } = useProductivityData();
  const [now, setNow] = useState(Date.now);
  const { toast } = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (["loading", "error", "saving"].includes(syncStatus)) return;
    const due = newReminders(tasks, now);
    if (!due.length) return;
    const keys = new Map(
      due.map((task) => [String(task.id), reminderKey(task)]),
    );
    setTasks((current) => markRemindersNotified(current, keys));
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
