import { api } from "../../utils/api";
import apptypes from "../types";
import type {
  AgentRecord,
  CreateAgentPayload,
  UpdateAgentPayload,
} from "../types/agentTypes";

export const getAgents = () => async (dispatch: any) => {
  dispatch({ type: apptypes.agents.FETCH_AGENTS_REQUEST });
  try {
    const data = await api.get<AgentRecord[]>("/agents");
    dispatch({
      type: apptypes.agents.FETCH_AGENTS_SUCCESS,
      payload: data,
    });
  } catch (error: any) {
    dispatch({
      type: apptypes.agents.FETCH_AGENTS_FAILURE,
      payload: error.message,
    });
  }
};

export const createAgent =
  (payload: CreateAgentPayload) => async (dispatch: any) => {
    dispatch({ type: apptypes.agents.CREATE_AGENT_REQUEST });
    try {
      const data = await api.post<AgentRecord, CreateAgentPayload>(
        "/agents",
        payload,
      );
      dispatch({
        type: apptypes.agents.CREATE_AGENT_SUCCESS,
        payload: data,
      });
      return data;
    } catch (error: any) {
      dispatch({
        type: apptypes.agents.CREATE_AGENT_FAILURE,
        payload: error.message,
      });
      throw error;
    }
  };

export const updateAgent =
  (id: string, payload: UpdateAgentPayload) => async (dispatch: any) => {
    dispatch({ type: apptypes.agents.UPDATE_AGENT_REQUEST });
    try {
      const data = await api.put<AgentRecord, UpdateAgentPayload>(
        `/agents/${id}`,
        payload,
      );
      dispatch({
        type: apptypes.agents.UPDATE_AGENT_SUCCESS,
        payload: data,
      });
      return data;
    } catch (error: any) {
      dispatch({
        type: apptypes.agents.UPDATE_AGENT_FAILURE,
        payload: error.message,
      });
      throw error;
    }
  };
