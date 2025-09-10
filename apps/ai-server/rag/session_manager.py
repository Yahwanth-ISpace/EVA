# rag/session_manager.py
class SessionManager:
    def __init__(self):
        self.sessions = {}

    def add_message(self, user_Id, question, answer):
        if user_Id not in self.sessions:
            self.sessions[user_Id] = []
        self.sessions[user_Id].append({"question": question, "answer": answer})

    def get_session(self, user_Id):
        return self.sessions.get(user_Id, [])

    def clear_session(self, user_Id):
        if user_Id in self.sessions:
            self.sessions[user_Id] = []
            
session_manager = SessionManager()
