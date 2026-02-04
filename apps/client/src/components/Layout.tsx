import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Outlet } from "react-router-dom";
import { getPayeeById } from "../redux/actions/payeeActions";
import type { RootState } from "../redux/store";
import { useAppDispatch } from "../utils/hooks";
import ChatButton from "./ChatButton";
import ChatWindow from "./ChatWindow";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const { user } = useSelector((state: RootState) => state.authState);
  const { payee } = useSelector((state: RootState) => state.payeeState);

  useEffect(() => {
    if (user?.payeeId) {
      dispatch(getPayeeById(user.payeeId));
    }
  }, [dispatch, user]);

  useEffect(() => {
    if (payee) {
      console.log("Fetched payee:", payee.payerId);
    }
  }, [payee]);

  // Close chat on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <div className="main-container min-h-screen w-full max-w-full overflow-x-hidden bg-[#F7F8FA]">
      <div className="min-h-screen w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Outlet />
      </div>

      {/* Chat Button */}
      <ChatButton onClick={() => setOpen(true)} />

      {/* Chat Window */}
      {open && user?.id && payee?.payerId && (
        <ChatWindow
          payerId={payee.payerId}
          userId={user.id}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
