import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index),
        line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);

const supabase = createClient(
  env.VITE_SUPABASE_URL || env.SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY,
);

const email = "spartan@spartan-nutrition.app";
const password = "0101";

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { username: "spartan" } },
});

if (error) {
  console.log(JSON.stringify({ ok: false, message: error.message, status: error.status ?? null }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    email: data.user?.email ?? email,
    userCreated: Boolean(data.user),
    sessionCreated: Boolean(data.session),
  }),
);
