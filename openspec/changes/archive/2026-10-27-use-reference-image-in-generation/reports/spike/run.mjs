import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const key = JSON.parse(readFileSync("/Users/josemunoz/Software/Vid4You/AI4Devs-finalproject/backend/.secrets.json", "utf8")).FAL_API_KEY;
const scenes = JSON.parse(readFileSync("scenes.json", "utf8"));
const ref = "data:image/webp;base64," + readFileSync("warry.webp").toString("base64");
const size = { width: 1920, height: 1088 };
const candidates = {
  "flux-dev": ["fal-ai/flux/dev", (p) => ({ prompt: p, image_size: size })],
  "flux-2-edit": ["fal-ai/flux-2/edit", (p) => ({ prompt: p, image_urls: [ref], image_size: size, output_format: "png" })],
  "flux-pro-kontext": ["fal-ai/flux-pro/kontext", (p) => ({ prompt: p, image_url: ref, aspect_ratio: "16:9", output_format: "png" })],
  "nano-banana-edit": ["fal-ai/nano-banana/edit", (p) => ({ prompt: p, image_urls: [ref], aspect_ratio: "16:9", output_format: "png" })],
  "seedream-v4-edit": ["fal-ai/bytedance/seedream/v4/edit", (p) => ({ prompt: p, image_urls: [ref], image_size: size })],
};
const only = process.argv[2];
const results = [];
for (const [name, [model, body]] of Object.entries(candidates)) {
  if (only && only !== name) continue;
  mkdirSync(`out/${name}`, { recursive: true });
  for (let i = 0; i < scenes.length; i++) {
    const t0 = Date.now();
    let rec = { candidate: name, model, scene: i + 1 };
    try {
      const res = await fetch(`https://fal.run/${model}`, { method: "POST", headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body(scenes[i])), signal: AbortSignal.timeout(300000) });
      rec.status = res.status; rec.latencyMs = Date.now() - t0;
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = null; }
      if (res.ok && json?.images?.[0]?.url) {
        const img = json.images[0]; rec.width = img.width; rec.height = img.height; rec.contentType = img.content_type;
        const bytes = Buffer.from(await (await fetch(img.url)).arrayBuffer());
        const ext = (img.content_type ?? "image/png").split("/")[1] ?? "png";
        writeFileSync(`out/${name}/scene${i + 1}.${ext}`, bytes); rec.bytes = bytes.length; rec.file = `out/${name}/scene${i + 1}.${ext}`;
      } else rec.error = text.slice(0, 300);
    } catch (e) { rec.error = String(e).slice(0, 200); rec.latencyMs = Date.now() - t0; }
    console.log(JSON.stringify(rec)); results.push(rec);
  }
}
writeFileSync(`results-${only ?? "all"}.json`, JSON.stringify(results, null, 1));
