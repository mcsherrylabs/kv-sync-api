// websocketModule.ts

import { w3cwebsocket as WebSocket } from 'websocket';
import { JLong, OSSerializable, getRandomLong, serialize } from './ostypes';


interface WebSocketRequest {
  type: string;
  ticket: number,
  data: any;
}

interface WebSocketResponse {
  ticket: number,
  data: any;
}
export class WebSocketModule {
  private readonly url: string;
  
  private client: WebSocket;
  private onOpen: () => void;
  //TODO fix this. Does not support simultaneous messages of the same type 
  // Use user and unique id?
  private messageQueue: Map<number, (data: any) => void> = new Map();

  constructor(url: string, doOnOpen: () => void) {
    this.url = url;
    this.onOpen = doOnOpen;
    this.connect();
  }

  private waitForResponse<T>(ticket: number): Promise<T> {
    return new Promise<T>((resolve) => {
      this.messageQueue.set(ticket, resolve);
    });
  }

  private connect(): void {

    this.client = new WebSocket(this.url);

    this.client.onopen = this.onOpen;

    this.client.onmessage = (event) => {
      const response: WebSocketResponse = JSON.parse(event.data as string);
      const { ticket, data } = response;
      const callback = this.messageQueue.get(ticket);
      if (callback) {
        callback(data);
        this.messageQueue.delete(ticket);
      }
    };


    this.client.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.client.onclose = () => {
      console.log('WebSocket connection closed.');
    };
  }

  private throwIfNotReady() {
    if (this.client.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  public async sendBin(data: Uint8Array): Promise<string> {
    this.throwIfNotReady();    
    const ticket = getRandomLong();
    const incTicket: OSSerializable = [new JLong(ticket),data];
    this.client.send(serialize(incTicket));
    return this.waitForResponse<string>(ticket);    
  }

  public async send<T>(type: string , data: any): Promise<T> {
    this.throwIfNotReady();
    const ticket: number = getRandomLong();
    const request: WebSocketRequest = {
      type,
      ticket,
      data,
    };
    this.client.send(JSON.stringify(request));
    return this.waitForResponse<T>(ticket);
    
  }

}
