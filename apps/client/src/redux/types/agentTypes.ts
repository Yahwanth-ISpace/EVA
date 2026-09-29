export const FETCH_AGENTS_REQUEST = "FETCH_AGENTS_REQUEST";
export const FETCH_AGENTS_SUCCESS = "FETCH_AGENTS_SUCCESS";
export const FETCH_AGENTS_FAILURE = "FETCH_AGENTS_FAILURE";

export const CREATE_AGENT_REQUEST = "CREATE_AGENT_REQUEST";
export const CREATE_AGENT_SUCCESS = "CREATE_AGENT_SUCCESS";
export const CREATE_AGENT_FAILURE = "CREATE_AGENT_FAILURE";

export const UPDATE_AGENT_REQUEST = "UPDATE_AGENT_REQUEST";
export const UPDATE_AGENT_SUCCESS = "UPDATE_AGENT_SUCCESS";
export const UPDATE_AGENT_FAILURE = "UPDATE_AGENT_FAILURE";

export const DELETE_AGENT_REQUEST = "DELETE_AGENT_REQUEST";
export const DELETE_AGENT_SUCCESS = "DELETE_AGENT_SUCCESS";
export const DELETE_AGENT_FAILURE = "DELETE_AGENT_FAILURE";

export type AgentStatus = "IN_PROGRESS" | "READY" | "SUSPENDED";

export interface AgentRecord {
  id: string;
  name: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberExt: string;
  status: AgentStatus;
  startTime?: string | null;
  endTime?: string | null;
}

export interface CreateAgentPayload {
  name: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberExt?: string;
  status?: AgentStatus;
}

export interface UpdateAgentPayload {
  name?: string;
  twilioPhoneNumber?: string;
  twilioPhoneNumberExt?: string;
  status?: AgentStatus;
}

export interface AgentsState {
  agents: AgentRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
}
