import * as authActions from "./authActions";
import * as appointmentsActions from "./appointmentsActions";
import * as officesActions from "./officesActions";
import * as providerActions from "./providerActions";
import * as payeeActions from "./payeeActions";
import * as chatActions from "./chatsActions";

const actions = {
  auth: authActions,
  appointments: appointmentsActions,
  offices: officesActions,
  provider: providerActions,
  payee: payeeActions,
  chats: chatActions,
};

export default actions;
