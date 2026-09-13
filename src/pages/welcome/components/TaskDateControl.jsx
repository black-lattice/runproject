import { useEffect, useState } from "react";
import { Button, Calendar, Popover, Switch, TimePicker } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import zhCN from "antd/locale/zh_CN";

export default function TaskDateControl({
  task,
  today,
  open,
  onOpenChange,
  onChange,
}) {
  const date = task.date ? dayjs(task.date) : dayjs(today);
  const [panelDate, setPanelDate] = useState(date);
  useEffect(
    () => setPanelDate(dayjs(task.date || today)),
    [task.date, today, open],
  );
  const label = task.date
    ? `${task.date === today ? "今天" : date.format("M月D日")}${task.time ? ` ${task.time}` : ""}`
    : "设置日期";
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={onOpenChange}
      title="日期与时间"
      content={
        <div className="task-date-panel">
          <Calendar
            locale={zhCN.Calendar}
            fullscreen={false}
            value={panelDate}
            onPanelChange={setPanelDate}
            onSelect={(value, info) => {
              setPanelDate(value);
              if (info.source === "date") {
                onChange({ date: value.format("YYYY-MM-DD") });
              }
            }}
          />
          <div className="task-date-time-row">
            <label htmlFor="task-all-day">全天</label>
            <Switch
              id="task-all-day"
              aria-label="全天任务"
              checked={!task.time}
              onChange={(allDay) =>
                onChange((current) => ({
                  ...current,
                  date: current.date || today,
                  time: allDay ? "" : "09:00",
                }))
              }
            />
            <TimePicker
              locale={zhCN.TimePicker}
              aria-label="任务时间"
              format="HH:mm"
              placeholder="设置时间"
              value={
                task.time ? dayjs(`${task.date || today}T${task.time}`) : null
              }
              needConfirm={false}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  date: value ? current.date || today : current.date,
                  time: value?.format("HH:mm") || "",
                }))
              }
            />
          </div>
          <div className="task-date-panel-actions">
            <Button
              type="text"
              disabled={!task.date}
              onClick={() => onChange({ date: "", time: "" })}
            >
              清除日期
            </Button>
            <Button type="primary" onClick={() => onOpenChange(false)}>
              完成
            </Button>
          </div>
        </div>
      }
    >
      <Button
        type="text"
        className={`task-detail-date-control${task.date ? " has-date" : ""}`}
        icon={<CalendarOutlined />}
        aria-label="设置日期与时间"
        title={
          task.date ? `${task.date} ${task.time || "全天"}` : "设置日期与时间"
        }
      >
        {label}
      </Button>
    </Popover>
  );
}
