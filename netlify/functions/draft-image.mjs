// Serves images uploaded in the editor before they are published.
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const file = decodeURIComponent(new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|svg|gif)$/.test(file)) return new Response("Not found", { status: 404 });
  const res = await getStore({ name: "psc-admin", consistency: "strong" }).getWithMetadata(`img/${file}`, { type: "arrayBuffer" });
  if (!res) return new Response("Not found", { status: 404 });
  return new Response(res.data, { headers: { "content-type": res.metadata?.type || "image/webp", "cache-control": "private, max-age=3600" } });
};
export const config = { path: "/api/draft-image/*" };
