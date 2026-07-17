import cronstrue from "cronstrue";

export interface CronScheduleResult {
  expression: string;
  description?: string;
  fieldCount?: 5 | 6;
  error?: string;
}

export const CRON_PRESETS = [
  { label: "Every minute", expression: "* * * * *" },
  { label: "Every 5 minutes", expression: "*/5 * * * *" },
  { label: "Hourly", expression: "0 * * * *" },
  { label: "Weekdays at 9:00 AM", expression: "0 9 * * 1-5" },
  { label: "Every 30 seconds", expression: "*/30 * * * * *" },
  { label: "Weekdays at 9:00 AM (with seconds)", expression: "0 0 9 * * 1-5" },
] as const;

export function describeCronSchedule(value: string): CronScheduleResult {
  const expression = value.trim().replace(/\s+/g, " ");
  if (!expression) {
    return { expression, error: "Enter a cron expression." };
  }

  if (expression.startsWith("@")) {
    return { expression, error: "Aliases are not supported. Use a 5- or 6-field cron expression." };
  }

  const fieldCount = expression.split(" ").length;
  if (fieldCount !== 5 && fieldCount !== 6) {
    return { expression, error: "Cron expressions must contain exactly 5 fields or 6 fields with seconds." };
  }

  try {
    return {
      expression,
      description: cronstrue.toString(expression, { throwExceptionOnParseError: true }),
      fieldCount,
    };
  } catch {
    return { expression, error: "Enter a valid cron expression." };
  }
}
