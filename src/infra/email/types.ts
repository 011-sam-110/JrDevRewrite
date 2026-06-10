export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailClient {
  send(message: EmailMessage): Promise<void>;
}
