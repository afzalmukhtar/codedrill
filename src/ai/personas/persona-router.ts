/**
 * Persona Router
 *
 * Routes user messages to the appropriate AI persona based on
 * the current session state (timer active, gave up, etc.).
 *
 * Routing Rules:
 * - Timer running + user asks for hint -> Interviewer
 * - Timer expired + user still trying -> Interviewer (escalated)
 * - User gives up -> Teacher
 * - User explicitly requests explanation -> Teacher
 * - Between sessions -> Teacher (for review/discussion)
 */

// import { InterviewerPersona } from "./interviewer";
// import { TeacherPersona } from "./teacher";

export class PersonaRouter {
  // TODO: constructor(interviewer, teacher)
  // TODO: routeMessage(message, sessionState): AsyncIterable<string>
  // TODO: getActivePersona(sessionState): "interviewer" | "teacher"
}
