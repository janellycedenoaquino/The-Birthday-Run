"use client";

import { useActionState, useState } from "react";
import { FormAlert, formError } from "@/components/auth/form-alert";
import { DaysLeftBadge } from "@/components/rewards/days-left-badge";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { Button } from "@/components/ui/button";
import { useSelection } from "@/components/use-selection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { fold } from "@/lib/retailers/filter";
import { useResultToast } from "./result-toast";

type Action<T = void> = (
  prev: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

export type PlanListRow = {
  id: string;
  name: string;
  logo_file: string | null;
  pickedUp: boolean;
  daysLeft: number | null;
  groups: string[]; // names of the groups it's in (M-224)
};

/** What "Add to group" needs: the groups to pick from, the new-group defaults, the actions. */
type AddProps = {
  groups: { id: string; name: string }[];
  defaultDate: string;
  defaultTime: string;
  range: { min: string; max: string };
  createGroup: Action<{ groupId: string }>;
  addToGroup: Action;
};

// S-106 "Rewards to plan" (SPEC §3.3: FR-22, FR-23, FR-26): search, "Hide grouped", checkboxes
// (picked-up rows can't be selected), a bar with the count, and the "Add to group" dialog.
export function PlanRewards({
  rows,
  groups,
  defaultDate,
  defaultTime,
  range,
  createGroup,
  addToGroup,
}: AddProps & { rows: PlanListRow[] }) {
  const [q, setQ] = useState("");
  const [hideGrouped, setHideGrouped] = useState(false);
  const { selected, toggle, clear } = useSelection();
  const [open, setOpen] = useState(false);
  const shown = rows.filter(
    (r) =>
      (!q || fold(r.name).includes(fold(q))) &&
      (!hideGrouped || r.groups.length === 0),
  );

  return (
    <section aria-labelledby="plan-rewards" className="mt-8">
      <h2 id="plan-rewards" className="sr-only">
        Rewards to plan
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        <Label htmlFor="plan-q" className="sr-only">
          Search rewards
        </Label>
        <Input
          id="plan-q"
          type="search"
          placeholder="Search rewards"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideGrouped}
            onChange={(e) => setHideGrouped(e.target.checked)}
            className="size-4"
          />
          {msg("M-223")}
        </label>
      </div>
      <ul className="mt-4 grid gap-2">
        {shown.map((r) => (
          <li key={r.id}>
            <label
              className={`flex items-center gap-3 rounded-lg border border-border/70 p-3 ${r.pickedUp ? "opacity-70" : "cursor-pointer hover:bg-muted"}`}
            >
              <input
                type="checkbox"
                className="size-5 shrink-0"
                disabled={r.pickedUp}
                checked={selected.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              <RetailerLogo name={r.name} logoFile={r.logo_file} size={36} />
              <span className="grid min-w-0 gap-1">
                <span className="font-medium">{r.name}</span>
                {r.pickedUp ? (
                  <span className="text-sm text-muted-foreground">
                    {msg("M-225")}
                  </span>
                ) : r.daysLeft !== null ? (
                  <DaysLeftBadge daysLeft={r.daysLeft} />
                ) : null}
                {r.groups.length ? (
                  <span className="text-sm text-muted-foreground">
                    {msg("M-224").replace("{groups}", r.groups.join(", "))}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {selected.size > 0 ? (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 shadow-sm">
          <span>{msg("M-226").replace("{count}", String(selected.size))}</span>
          <Button size="lg" onClick={() => setOpen(true)}>
            {msg("M-228")}
          </Button>
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{msg("M-228")}</DialogTitle>
            <DialogDescription>
              {msg("M-226").replace("{count}", String(selected.size))}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <AddForms
              retailerIds={[...selected]}
              groups={groups}
              defaultDate={defaultDate}
              defaultTime={defaultTime}
              range={range}
              createGroup={createGroup}
              addToGroup={addToGroup}
              onDone={() => {
                setOpen(false);
                clear();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AddForms({
  retailerIds,
  groups,
  defaultDate,
  defaultTime,
  range,
  createGroup,
  addToGroup,
  onDone,
}: AddProps & { retailerIds: string[]; onDone: () => void }) {
  return (
    <Tabs defaultValue="new">
      <TabsList>
        <TabsTrigger value="new">New group</TabsTrigger>
        <TabsTrigger value="existing" disabled={groups.length === 0}>
          Existing group
        </TabsTrigger>
      </TabsList>
      <TabsContent value="new">
        <PlanForm
          action={createGroup}
          onDone={onDone}
          retailerIds={retailerIds}
        >
          {(errors) => (
            <GroupFields
              errors={errors}
              defaultDate={defaultDate}
              range={range}
              time={defaultTime}
            />
          )}
        </PlanForm>
      </TabsContent>
      <TabsContent value="existing">
        <PlanForm action={addToGroup} onDone={onDone} retailerIds={retailerIds}>
          {() => (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Group</legend>
              {groups.map((g, i) => (
                <label key={g.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="groupId"
                    value={g.id}
                    defaultChecked={i === 0}
                  />
                  {g.name}
                </label>
              ))}
            </fieldset>
          )}
        </PlanForm>
      </TabsContent>
    </Tabs>
  );
}

/** One Plan form: hidden retailer IDs, the fields, the form alert, and the M-228 button. */
export function PlanForm<T>({
  action: run,
  onDone,
  retailerIds = [],
  submitLabel = msg("M-228"),
  hidden = {},
  children,
}: {
  action: Action<T>;
  onDone: () => void;
  retailerIds?: string[];
  submitLabel?: string;
  hidden?: Record<string, string>;
  children: (errors: Record<string, string[]> | undefined) => React.ReactNode;
}) {
  const [state, action, pending] = useActionState(
    async (prev: ActionResult<T> | null, fd: FormData) => {
      const result = await run(prev, fd);
      if (result.ok) onDone();
      return result;
    },
    null,
  );
  useResultToast(state);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="mt-4 grid gap-4" noValidate>
      {retailerIds.map((id) => (
        <input key={id} type="hidden" name="retailerIds" value={id} />
      ))}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children(errors)}
      {errors?.form ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.form[0]}
        </p>
      ) : null}
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Name, date and time (FR-23), shared by "New group" and "Edit". */
export function GroupFields({
  errors,
  defaultDate,
  range,
  name = "",
  time = "12:00",
}: {
  errors: Record<string, string[]> | undefined;
  defaultDate: string;
  range: { min: string; max: string };
  name?: string;
  time?: string;
}) {
  const field = (
    id: string,
    label: string,
    input: React.ReactNode,
    error?: string[],
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {error?.length ? (
        <p className="text-sm text-destructive">{error[0]}</p>
      ) : null}
    </div>
  );
  return (
    <>
      {field(
        "group-name",
        "Name",
        <Input
          id="group-name"
          name="name"
          defaultValue={name}
          maxLength={80}
          className="h-11"
          aria-invalid={errors?.name ? true : undefined}
        />,
        errors?.name,
      )}
      <div className="grid grid-cols-2 gap-3">
        {field(
          "group-date",
          "Pickup date",
          <Input
            id="group-date"
            name="pickupDate"
            type="date"
            defaultValue={defaultDate}
            min={range.min}
            max={range.max}
            className="h-11"
            aria-invalid={errors?.pickupDate ? true : undefined}
          />,
          errors?.pickupDate,
        )}
        {field(
          "group-time",
          "Time",
          <Input
            id="group-time"
            name="pickupTime"
            type="time"
            defaultValue={time}
            className="h-11"
          />,
          errors?.pickupTime,
        )}
      </div>
    </>
  );
}
