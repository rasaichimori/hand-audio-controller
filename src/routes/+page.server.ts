import { env } from "$env/dynamic/private";

export const load = () => {
  // Strip quotes if present (from .env file)
  const projectUrl = (env.PROJECT_URL ?? "").replace(/^["']|["']$/g, "");

  console.log("[Server] Loading env vars - URL:", projectUrl);

  return {
    projectUrl,
  };
};
