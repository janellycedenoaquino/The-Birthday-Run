"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ConfirmCancel, ConfirmDialog, EditDialog } from "@/components/dialogs";
import { MoreMenu } from "@/components/more-menu";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatDate, type LocalDate } from "@/lib/birthday/timing";
import { msg, type MessageId } from "@/lib/messages";
import { GroupFields, PlanForm } from "./plan-rewards";

type Action<T = void> = (
  prev: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

export type GroupItem = { id: string; name: string };
export type GroupCardData = {
  id: string;
  name: string;
  pickupDate: string;
  pickupTime: string; // HH:MM
  pickupLabel: string; // M-234 filled in
  outside: boolean; // FR-9 flag (M-235)
  items: GroupItem[];
};

// Decision 0016: the theme's red is about 3.5:1 on the pink ticket; this one is about 6:1 (WCAG AA).
const TICKET_ALERT = "font-bold text-[#a3001b] dark:text-destructive";

// One S-106 group (SPEC §3.3: FR-27). The rewards reorder by drag, or by keyboard on the handle
// (Space to lift, arrows to move, Space to drop) with M-237's announcements; without JS each row
// has Move up / Move down buttons posting the reordered list.
export function GroupCard({
  group,
  range,
  actions,
  route,
  itemLimit,
}: {
  group: GroupCardData;
  /** Free users see the per-group limit ("3 of 5 rewards", decision 0016); premium gets none. */
  itemLimit?: number;
  range: { min: string; max: string };
  /** S-106's route slot (FR-33): the group route for premium, C-104 for free; none under 2. */
  route?: ReactNode;
  actions: {
    updateGroup: Action;
    deleteGroup: Action;
    removeFromGroup: Action;
    reorderGroupItems: Action;
    /** FR-28: premium only. Free users get no control (the page leaves it out). */
    duplicateGroup?: Action<{ groupId: string }>;
  };
}) {
  const router = useRouter();
  const [order, setOrder] = useState(group.items);
  const [conflict, setConflict] = useState(false);
  // The page keys this card by its saved order, so a new order from the server remounts it.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const nameOf = (id: unknown) => order.find((i) => i.id === id)?.name ?? "";
  const pos = (id: unknown) => order.findIndex((i) => i.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}. Position ${pos(active.id)} of ${order.length}.`,
    // Not over itself: at lift dnd-kit reports "over" the item, which would replace "Picked up".
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${nameOf(active.id)} moved to position ${pos(over.id)} of ${order.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped at position ${pos(over.id)} of ${order.length}.`
        : undefined,
    onDragCancel: () => "Move cancelled.",
  };

  const save = (next: GroupItem[]) => {
    const previous = order;
    setOrder(next);
    const fd = new FormData();
    fd.set("groupId", group.id);
    for (const item of previous) fd.append("expected", item.id);
    for (const item of next) fd.append("itemIds", item.id);
    startTransition(async () => {
      const result = await actions.reorderGroupItems(null, fd);
      if (!result.ok) {
        setOrder(previous);
        if (result.error === "BR-17") setConflict(true);
        else toast.error(msg(result.error as MessageId));
      }
    });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    save(arrayMove(order, pos(active.id) - 1, pos(over.id) - 1));
  };

  return (
    // Decision 0016: a pink ticket: a white date stamp, the name and pickup, a dashed tear line,
    // then the numbered stops.
    <li className="grid min-w-0 grid-cols-1 gap-3 rounded-[22px] bg-[var(--glow-pink)] p-4 text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] sm:p-5 dark:bg-[#4a3438] dark:text-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3.5">
          <DateStamp date={group.pickupDate as LocalDate} />
          <div>
            <h3 className="text-lg font-extrabold">{group.name}</h3>
            <p className="text-sm text-muted-foreground">{group.pickupLabel}</p>
            {itemLimit !== undefined ? (
              <p className="text-sm font-bold">
                {msg("M-306")
                  .replace("{count}", String(order.length))
                  .replace("{limit}", String(itemLimit))}
              </p>
            ) : null}
            {group.outside ? (
              <p className={`text-sm ${TICKET_ALERT}`}>{msg("M-235")}</p>
            ) : null}
          </div>
        </div>
        {/* Decision 0016: Edit, Duplicate (premium) and Delete in a ⋯ menu. */}
        <MoreMenu label={`More for ${group.name}`}>
          <EditGroup
            group={group}
            range={range}
            updateGroup={actions.updateGroup}
          />
          {actions.duplicateGroup ? (
            <DuplicateGroup
              group={group}
              duplicateGroup={actions.duplicateGroup}
            />
          ) : null}
          <DeleteGroup group={group} deleteGroup={actions.deleteGroup} />
        </MoreMenu>
      </div>
      {conflict ? (
        <div
          role="alert"
          className={`flex flex-wrap items-center gap-2 text-sm ${TICKET_ALERT}`}
        >
          {msg("BR-17")}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setConflict(false);
              router.refresh();
            }}
          >
            Refresh
          </Button>
        </div>
      ) : null}
      <hr
        aria-hidden="true"
        className="border-0 border-t-2 border-dashed border-[color-mix(in_srgb,var(--navy)_35%,transparent)]"
      />
      {order.length === 0 ? (
        <p className="text-sm text-muted-foreground">{msg("M-241")}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext
            items={order.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="grid gap-2">
              {order.map((item, index) => (
                <SortableRow
                  key={item.id}
                  n={index + 1}
                  item={item}
                  groupId={group.id}
                  current={order}
                  up={index > 0 ? arrayMove(order, index, index - 1) : null}
                  down={
                    index < order.length - 1
                      ? arrayMove(order, index, index + 1)
                      : null
                  }
                  actions={actions}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {route}
    </li>
  );
}

function SortableRow({
  n,
  item,
  groupId,
  current,
  up,
  down,
  actions,
}: {
  n: number;
  item: GroupItem;
  groupId: string;
  current: GroupItem[];
  up: GroupItem[] | null;
  down: GroupItem[] | null;
  actions: { removeFromGroup: Action; reorderGroupItems: Action };
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-xl bg-white/90 p-2 text-[var(--navy)] shadow-[0_0_0_1.5px_var(--border)]"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={msg("M-236").replace("{retailer}", item.name)}
        className="flex size-9 items-center justify-center rounded-md hover:bg-[var(--glow-pink)]"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <i
        aria-hidden="true"
        className="grid size-7 not-italic shrink-0 place-items-center rounded-full bg-[var(--bubblegum)] text-sm font-extrabold shadow-[0_0_0_1.5px_var(--navy)]"
      >
        {n}
      </i>
      <span className="min-w-0 flex-1 font-bold">{item.name}</span>
      <MoveForm
        groupId={groupId}
        current={current}
        order={up}
        label={`Move ${item.name} up`}
        text="Up"
        action={actions.reorderGroupItems}
      />
      <MoveForm
        groupId={groupId}
        current={current}
        order={down}
        label={`Move ${item.name} down`}
        text="Down"
        action={actions.reorderGroupItems}
      />
      <SmallForm
        action={actions.removeFromGroup}
        fields={{ groupId, itemId: item.id }}
        label={`Remove ${item.name}`}
        text="Remove"
      />
    </li>
  );
}

/** The no-JS reorder: a form posting the whole list in its new order. */
function MoveForm({
  groupId,
  current,
  order,
  label,
  text,
  action,
}: {
  groupId: string;
  current: GroupItem[];
  order: GroupItem[] | null;
  label: string;
  text: string;
  action: Action;
}) {
  if (!order) return null;
  return (
    <SmallForm
      action={action}
      fields={{ groupId }}
      expected={current.map((i) => i.id)}
      list={order.map((i) => i.id)}
      label={label}
      text={text}
    />
  );
}

function SmallForm({
  action: run,
  fields,
  expected = [],
  list = [],
  label,
  text,
}: {
  action: Action;
  fields: Record<string, string>;
  expected?: string[];
  list?: string[];
  label: string;
  text: string;
}) {
  // Errors show next to the button (also without JS, where a toast never runs).
  const [state, action, pending] = useActionState(run, null);
  return (
    <form action={action} className="flex items-center gap-1">
      {expected.map((id) => (
        <input key={`e-${id}`} type="hidden" name="expected" value={id} />
      ))}
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {list.map((id) => (
        <input key={id} type="hidden" name="itemIds" value={id} />
      ))}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        aria-label={label}
        disabled={pending}
      >
        {text}
      </Button>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {msg(state.error as MessageId)}
        </span>
      ) : null}
    </form>
  );
}

function EditGroup({
  group,
  range,
  updateGroup,
}: {
  group: GroupCardData;
  range: { min: string; max: string };
  updateGroup: Action;
}) {
  return (
    <EditDialog
      label={`Edit ${group.name}`}
      title={group.name}
      description="Edit the name, date and time."
      variant="ghost"
    >
      {(close) => (
        <PlanForm
          action={updateGroup}
          onDone={close}
          hidden={{ groupId: group.id }}
          submitLabel="Save"
        >
          {(errors) => (
            <GroupFields
              errors={errors}
              defaultDate={group.pickupDate}
              range={range}
              name={group.name}
              time={group.pickupTime}
            />
          )}
        </PlanForm>
      )}
    </EditDialog>
  );
}

/** FR-28: one button posting the group's ID; works without JS. Errors show under the card. */
function DuplicateGroup({
  group,
  duplicateGroup,
}: {
  group: GroupCardData;
  duplicateGroup: Action<{ groupId: string }>;
}) {
  const [state, action, pending] = useActionState(duplicateGroup, null);
  const error =
    state && !state.ok
      ? (state.fieldErrors?.form?.[0] ?? msg(state.error as MessageId))
      : null;
  return (
    <form action={action}>
      <input type="hidden" name="groupId" value={group.id} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Duplicate ${group.name}`}
      >
        Duplicate
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** C-108 (M-187/M-188): a link to ?deleteGroup=<id> first (no-JS confirm), a dialog with JS. */
function DeleteGroup({
  group,
  deleteGroup,
}: {
  group: GroupCardData;
  deleteGroup: Action;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button asChild size="sm" variant="ghost">
        <Link
          href={`/plan?deleteGroup=${group.id}`}
          scroll={false}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          aria-label={`Delete ${group.name}`}
        >
          Delete
        </Link>
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={msg("M-187").replace("{name}", group.name)}
        text={msg("M-188")}
      >
        <PlanForm
          action={deleteGroup}
          onDone={() => setOpen(false)}
          hidden={{ groupId: group.id }}
          submitLabel="Delete"
        >
          {() => <ConfirmCancel />}
        </PlanForm>
      </ConfirmDialog>
    </>
  );
}

/** The ticket's date stamp: month over day, white on the pink ticket. */
function DateStamp({ date }: { date: LocalDate }) {
  const [month, day] = formatDate(date, "short").split(" ");
  return (
    <span
      aria-hidden="true"
      className="grid w-14 shrink-0 overflow-hidden rounded-xl bg-white text-center text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]"
    >
      <span className="pt-1 text-[11px] font-extrabold tracking-[0.12em] uppercase">
        {month}
      </span>
      <span className="pb-1 text-2xl leading-tight font-extrabold">{day}</span>
    </span>
  );
}
