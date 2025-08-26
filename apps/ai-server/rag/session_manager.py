# rag/session_manager.py

from typing import Dict, List

class session_manager:
    def __init__(self):
        self.sessions: Dict[str, List[Dict]] = {}

    def get_session(self, user_id: str) -> List[Dict]:
        return self.sessions.setdefault(user_id, [])

    def add_message(self, user_id: str, question: str, answer: str):
        self.get_session(user_id).append({"question": question, "answer": answer})

    def clear_session(self, user_id: str):
        if user_id in self.sessions:
            del self.sessions[user_id]
