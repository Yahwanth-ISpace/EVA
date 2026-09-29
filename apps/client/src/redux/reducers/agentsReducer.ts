import type {
  AgentRecord,
  AgentsState,
} from "../types/agentTypes";
import * as AgentTypes from "../types/agentTypes";

const initialState: AgentsState = {
  agents: [],
  loading: false,
  saving: false,
  error: null,
};

export function agentsReducer(
  state = initialState,
  action: { type: string; payload?: unknown },
): AgentsState {
  switch (action.type) {
    case AgentTypes.FETCH_AGENTS_REQUEST:
      return { ...state, loading: true, error: null };

    case AgentTypes.FETCH_AGENTS_SUCCESS:
      return {
        ...state,
        loading: false,
        agents: action.payload as AgentRecord[],
      };

    case AgentTypes.FETCH_AGENTS_FAILURE:
      return {
        ...state,
        loading: false,
        error: action.payload as string,
      };

    case AgentTypes.CREATE_AGENT_REQUEST:
    case AgentTypes.UPDATE_AGENT_REQUEST:
    case AgentTypes.DELETE_AGENT_REQUEST:
      return { ...state, saving: true, error: null };

    case AgentTypes.CREATE_AGENT_SUCCESS:
      return {
        ...state,
        saving: false,
        agents: [...state.agents, action.payload as AgentRecord].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };

    case AgentTypes.UPDATE_AGENT_SUCCESS: {
      const updated = action.payload as AgentRecord;
      return {
        ...state,
        saving: false,
        agents: state.agents
          .map((agent) => (agent.id === updated.id ? updated : agent))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }

    case AgentTypes.DELETE_AGENT_SUCCESS:
      return {
        ...state,
        saving: false,
        agents: state.agents.filter(
          (agent) => agent.id !== (action.payload as string),
        ),
      };

    case AgentTypes.CREATE_AGENT_FAILURE:
    case AgentTypes.UPDATE_AGENT_FAILURE:
    case AgentTypes.DELETE_AGENT_FAILURE:
      return {
        ...state,
        saving: false,
        error: action.payload as string,
      };

    default:
      return state;
  }
}
