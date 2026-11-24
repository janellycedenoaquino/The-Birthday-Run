import { Link, Section, Text } from "react-email";

// Shared pieces of the reminder emails E-101 / E-102 (SPEC §3.4 "Emails", FR-41, FR-42).
// Relative imports only: the react-email CLI bundles these files itself.

export type ReminderLine = {
  name: string;
  description: string;
  /** M-120–M-122 or "Last day: {date}", filled in by the sender. */
  when: string;
};

export function RewardList({ items }: { items: ReminderLine[] }) {
  return (
    <Section style={{ margin: "0 0 24px" }}>
      {items.map((item) => (
        <Text
          key={item.name}
          style={{
            color: "#2c3330",
            fontSize: 15,
            lineHeight: "22px",
            margin: "0 0 12px",
          }}
        >
          <strong>{item.name}</strong>
          <br />
          {item.description}
          <br />
          <span style={{ color: "#57605c", fontSize: 13 }}>{item.when}</span>
        </Text>
      ))}
    </Section>
  );
}

/** M-275: why they got it, the turn-off link (S-112) and Settings. */
export function ReminderFooter({
  unsubscribeUrl,
  settingsUrl,
}: {
  unsubscribeUrl: string;
  settingsUrl: string;
}) {
  return (
    <>
      You&apos;re getting this because birthday reminders are on.{" "}
      <Link href={unsubscribeUrl} style={{ color: "#6b7470" }}>
        Turn off reminders
      </Link>{" "}
      ·{" "}
      <Link href={settingsUrl} style={{ color: "#6b7470" }}>
        Change in Settings
      </Link>
    </>
  );
}
