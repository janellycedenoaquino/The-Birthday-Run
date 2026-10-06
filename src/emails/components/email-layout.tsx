import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import type { ReactNode } from "react";
import { appConfig } from "../../config/app";

// The one layout for E-1..E-4 (BUILD F-5, SPEC §3.4 "Emails", D16): logo, app name, a
// brand-colour button, the plain URL below it, the support email. No expiry times. Relative
// imports: the react-email CLI bundles these files itself.

export function EmailLayout({
  siteUrl,
  preview,
  heading,
  intro,
  buttonLabel,
  url,
  footnote,
}: {
  /** `{{ .SiteURL }}` in auth templates; getSiteUrl() for the welcome email. */
  siteUrl: string;
  preview: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  footnote: ReactNode;
}) {
  const { brand, name, supportEmail } = appConfig;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f6f7f6",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "white",
            borderRadius: 12,
            maxWidth: 480,
            padding: "32px 28px",
          }}
        >
          <Section>
            <Img
              src={`${siteUrl}/brand/logo.png`}
              alt={appConfig.logo.alt}
              width={40}
              height={40}
              style={{ borderRadius: 10 }}
            />
            <Text
              style={{
                color: "#57605c",
                fontSize: 14,
                fontWeight: 600,
                margin: "12px 0 0",
              }}
            >
              {name}
            </Text>
          </Section>
          <Heading
            as="h1"
            style={{
              color: "#1a1f1d",
              fontSize: 22,
              fontWeight: 600,
              margin: "24px 0 12px",
            }}
          >
            {heading}
          </Heading>
          <Text
            style={{
              color: "#2c3330",
              fontSize: 16,
              lineHeight: "24px",
              margin: "0 0 24px",
            }}
          >
            {intro}
          </Text>
          <Button
            href={url}
            style={{
              backgroundColor: brand.primary,
              borderRadius: 8,
              color: brand.primaryForeground,
              fontSize: 16,
              fontWeight: 600,
              padding: "12px 20px",
            }}
          >
            {buttonLabel}
          </Button>
          <Text
            style={{
              color: "#57605c",
              fontSize: 13,
              lineHeight: "20px",
              margin: "24px 0 0",
              wordBreak: "break-all",
            }}
          >
            Or open this link:{" "}
            <Link href={url} style={{ color: "#57605c" }}>
              {url}
            </Link>
          </Text>
          <Text
            style={{
              color: "#57605c",
              fontSize: 14,
              lineHeight: "22px",
              margin: "16px 0 0",
            }}
          >
            {footnote}
          </Text>
          <Hr style={{ borderColor: "#e5e8e6", margin: "28px 0 16px" }} />
          <Text style={{ color: "#6b7470", fontSize: 12, margin: 0 }}>
            {name} ·{" "}
            <Link href={`mailto:${supportEmail}`} style={{ color: "#6b7470" }}>
              {supportEmail}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
