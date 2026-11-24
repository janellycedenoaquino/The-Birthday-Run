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
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";
import { GroupFields, PlanForm } from "./plan-rewards";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

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

// One S-106 group (SPEC §3.3: FR-27). The rewards reorder by drag, or by keyboard on the handle
// (Space to lift, arrows to move, Space to drop) with M-237's announcements; without JS each row
// has Move up / Move down buttons posting the reordered list.
export function GroupCard({
  group,
  range,
  actions,
  route,
}: {
  group: GroupCardData;
  range: { min: string; max: string };
  /** S-106's route slot (FR-33): the group route for premium, C-104 for free; none under 2. */
  route?: ReactNode;
  actions: {
    updateGroup: Action;
    deleteGroup: Action;
    removeFromGroup: Action;
    reorderGroupItems: Action;
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
    <li className="grid gap-3 rounded-lg border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{group.name}</h3>
          <p className="text-sm text-muted-foreground">{group.pickupLabel}</p>
          {group.outside ? (
            <p className="text-sm text-destructive">{msg("M-235")}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <EditGroup
            group={group}
            range={range}
            updateGroup={actions.updateGroup}
          />
          <DeleteGroup group={group} deleteGroup={actions.deleteGroup} />
        </div>
      </div>
      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
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
  item,
  groupId,
  current,
  up,
  down,
  actions,
}: {
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
      className="flex items-center gap-2 rounded-md border border-border/70 bg-background p-2"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={msg("M-236").replace("{retailer}", item.name)}
        className="flex size-9 items-center justify-center rounded-md hover:bg-muted"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span className="min-w-0 flex-1">{item.name}</span>
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
