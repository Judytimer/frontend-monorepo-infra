export function formatAddress(
  addr: string,
  head = 6,
  tail = 4
) {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return addr.slice(0, head) + "..." + addr.slice(-tail);
}
