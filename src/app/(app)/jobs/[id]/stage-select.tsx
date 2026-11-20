"use client";

import { useTransition } from "react";
import { moveJob, toggleTask } from "../../actions";

export function StageSelect({ jobId, stageId, stages }: { jobId: string; stageId: string; stages: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Etapa"
      defaultValue={stageId}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => moveJob(jobId, v));
      }}
      className="input w-auto font-medium"
    >
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function TaskCheckbox({ taskId, jobId, done }: { taskId: string; jobId: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      defaultChecked={done}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.checked;
        start(() => toggleTask(taskId, jobId, v));
      }}
      className="h-4 w-4 accent-navy"
    />
  );
}
