export async function api<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
    return data as T;
}
