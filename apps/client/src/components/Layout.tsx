import { Outlet } from "react-router-dom";
import ChatButton from "./ChatButton";
import ChatModal from "./ChatModal";
import ChatWindow from "./ChatWindow";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { getPayeeById } from "../redux/actions/payeeActions";
import { useAppDispatch } from "../utils/hooks";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const { user } = useSelector((state: RootState) => state.authState);
  const { payee } = useSelector((state: RootState) => state.payeeState);

  useEffect(() => {
    if (user && user.payeeId) {
      dispatch(getPayeeById(user.payeeId));
    }
    console.log(payee);
  }, []);
  return (
    <div className="main-container min-h-screen w-screen bg-[#F7F8FA]">
      <div className="min-h-screen text-gray-900 px-6 pt-4 max-w-7xl mx-auto">
        <Outlet />
      </div>
      <ChatButton onClick={() => setOpen(true)} />
      <ChatModal isOpen={open} onClose={() => setOpen(false)}>
        {payee && payee.payerId && user && user.id && (
          <ChatWindow payerId={payee.payerId} userId={user.id} />
        )}
      </ChatModal>
    </div>
  );
}
