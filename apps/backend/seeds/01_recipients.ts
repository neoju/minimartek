import type { Knex } from "knex";

const FIRST_NAMES = [
  "alice",
  "bob",
  "carol",
  "dave",
  "eve",
  "frank",
  "grace",
  "henry",
  "iris",
  "jack",
  "karen",
  "liam",
  "mia",
  "noah",
  "olivia",
  "paul",
  "quinn",
  "rachel",
  "sam",
  "tina",
  "uma",
  "victor",
  "wendy",
  "xander",
  "yara",
  "zoe",
];

const DOMAINS = ["example.com", "test.dev", "demo.io", "sample.org", "mail.test"];

function generateRecipients(count: number) {
  const recipients: { email: string; name: string }[] = [];

  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const domain = DOMAINS[i % DOMAINS.length]!;
    const num = i + 1;
    const email = `${first}.${num}@${domain}`;
    const displayName = first.charAt(0).toUpperCase() + first.slice(1);
    recipients.push({ email, name: `${displayName} ${num}` });
  }

  return recipients;
}

export async function seed(knex: Knex): Promise<void> {
  await knex("recipients").del();
  await knex("recipients").insert(generateRecipients(10000));
}
