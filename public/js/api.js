async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* body was not JSON */ }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res;
}

export const api = {
  health: () => request("/api/health").then((r) => r.json()),

  list: ({ q = "", skip = 0, limit = 10 } = {}) => {
    const params = new URLSearchParams({ skip, limit });
    if (q) params.set("q", q);
    return request(`/api/transcriptions?${params}`).then((r) => r.json());
  },

  create: (data) =>
    request("/api/transcriptions", { method: "POST", body: JSON.stringify(data) }).then((r) => r.json()),

  update: (id, data) =>
    request(`/api/transcriptions/${id}`, { method: "PUT", body: JSON.stringify(data) }).then((r) => r.json()),

  remove: (id) => request(`/api/transcriptions/${id}`, { method: "DELETE" }),

  speak: (text) =>
    request("/api/tts", { method: "POST", body: JSON.stringify({ text }) }).then((r) => r.blob()),
};
