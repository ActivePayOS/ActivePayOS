import { redirect } from "next/navigation";

// The Pay Calculator now lives on the home page; keep this URL working for any
// existing links and bookmarks.
export default function PayPage() {
  redirect("/");
}
