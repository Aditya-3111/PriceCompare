const BASE = import.meta.env.VITE_API_URL || "";
export async function api(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(BASE + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...(localStorage.getItem("pincode") && { "X-Pincode": localStorage.getItem("pincode") }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) { localStorage.removeItem("token"); }
    throw new Error(data.error || data.msg || "Something went wrong");
  }
  return data;
}
