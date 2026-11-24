import { EmailLayout } from "./components/email-layout";
import {
  ReminderFooter,
  RewardList,
  type ReminderLine,
} from "./components/reminder-parts";

// E-102 expiring (SPEC §3.4, BUILD F-12, FR-41, A-9): rewards with 3 days or fewer left.

/** "{count} birthday rewards end soon" / "1 birthday reward ends soon" (no app name). */
export const expiringSubject = (count: number) =>
  count === 1
    ? "1 birthday reward ends soon"
    : `${count} birthday rewards end soon`;

type Props = {
  siteUrl: string;
  items: ReminderLine[];
  unsubscribeUrl: string;
};

// Defaults: the react-email CLI's export (npm run email:build) renders every template with no props.
export default function ReminderExpiring({
  siteUrl,
  items = [],
  unsubscribeUrl = "",
}: Props) {
  return (
    <EmailLayout
      siteUrl={siteUrl}
      preview={expiringSubject(items.length)}
      heading="Don't miss these"
      intro="These rewards end in the next few days:"
      buttonLabel="See my rewards"
      url={`${siteUrl}/rewards`}
      footer={
        <ReminderFooter
          unsubscribeUrl={unsubscribeUrl}
          settingsUrl={`${siteUrl}/settings#reminders`}
        />
      }
    >
      <RewardList items={items} />
    </EmailLayout>
  );
}

ReminderExpiring.PreviewProps = {
  siteUrl: "http://localhost:3000",
  items: [
    {
      name: "Starbucks",
      description: "A free drink or food item",
      when: "Last day",
    },
  ],
  unsubscribeUrl: "http://localhost:3000/reminders/unsubscribe?token=preview",
} satisfies Props;
