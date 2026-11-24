import { EmailLayout } from "./components/email-layout";
import {
  ReminderFooter,
  RewardList,
  type ReminderLine,
} from "./components/reminder-parts";

// E-101 plan ahead (SPEC §3.4, BUILD F-12, FR-41): sent once per birthday year, before the user's
// earliest reward opens or join-by date (up to 32 days ahead, at the latest 7; due.ts PLAN_AHEAD). Subject (no app name, Template §3.4): PLAN_AHEAD_SUBJECT.
export const PLAN_AHEAD_SUBJECT = "Time to plan your Birthday Run";

type Props = {
  siteUrl: string;
  birthday: string; // formatted, e.g. "June 15"
  items: ReminderLine[];
  unsubscribeUrl: string;
};

// Defaults: the react-email CLI's export (npm run email:build) renders every template with no props.
export default function ReminderPlanAhead({
  siteUrl,
  birthday = "",
  items = [],
  unsubscribeUrl = "",
}: Props) {
  return (
    <EmailLayout
      siteUrl={siteUrl}
      preview={`Your birthday is on ${birthday}.`}
      heading="Plan your Birthday Run"
      intro={`Your birthday is on ${birthday}. Here's what you can pick up, and when:`}
      buttonLabel="Plan your run"
      url={`${siteUrl}/plan`}
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

ReminderPlanAhead.PreviewProps = {
  siteUrl: "http://localhost:3000",
  birthday: "June 15",
  items: [
    {
      name: "Starbucks",
      description: "A free drink or food item",
      when: "Opens June 15 · Last day: June 15",
    },
  ],
  unsubscribeUrl: "http://localhost:3000/reminders/unsubscribe?token=preview",
} satisfies Props;
