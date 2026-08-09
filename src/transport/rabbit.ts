import amqp, { Channel, ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { config } from '../config/env.js';
import { NotificationMessage } from '../core/types.js';

export class RabbitTransport {
  private connection?: ChannelModel;
  private publisher?: ConfirmChannel;
  private consumer?: Channel;

  async connect(): Promise<void> {
    const connection = await amqp.connect(config.RABBITMQ_URL);
    const publisher = await connection.createConfirmChannel();
    const consumer = await connection.createChannel();
    this.connection = connection;
    this.publisher = publisher;
    this.consumer = consumer;
    await this.declareTopology(publisher);
    await this.declareTopology(consumer);
    await consumer.prefetch(config.RABBITMQ_PREFETCH);
  }

  private async declareTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(config.RABBITMQ_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(`${config.RABBITMQ_EXCHANGE}.dead`, 'direct', { durable: true });
    await channel.assertQueue(config.RABBITMQ_QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': `${config.RABBITMQ_EXCHANGE}.dead`, 'x-dead-letter-routing-key': 'dead' } });
    await channel.bindQueue(config.RABBITMQ_QUEUE, config.RABBITMQ_EXCHANGE, 'deliver');
    await channel.assertQueue(config.RABBITMQ_DLQ, { durable: true });
    await channel.bindQueue(config.RABBITMQ_DLQ, `${config.RABBITMQ_EXCHANGE}.dead`, 'dead');
    for (const [index, delay] of config.retryDelaysMs.entries()) {
      const name = `${config.RABBITMQ_QUEUE}.retry.${index + 1}`;
      await channel.assertQueue(name, { durable: true, arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': config.RABBITMQ_EXCHANGE, 'x-dead-letter-routing-key': 'deliver' } });
    }
  }

  async publish(message: NotificationMessage): Promise<void> {
    if (!this.publisher) throw new Error('RabbitMQ publisher is not connected');
    this.publisher.publish(config.RABBITMQ_EXCHANGE, 'deliver', Buffer.from(JSON.stringify(message)), { persistent: true, contentType: 'application/json', messageId: message.deliveryId, timestamp: Date.now() });
    await this.publisher.waitForConfirms();
  }

  async retry(message: NotificationMessage): Promise<void> {
    if (!this.publisher) throw new Error('RabbitMQ publisher is not connected');
    const index = Math.min(Math.max(message.attempt - 1, 0), Math.max(config.retryDelaysMs.length - 1, 0));
    const queue = `${config.RABBITMQ_QUEUE}.retry.${index + 1}`;
    this.publisher.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true, contentType: 'application/json', messageId: message.deliveryId });
    await this.publisher.waitForConfirms();
  }

  async deadLetter(message: NotificationMessage, reason: string): Promise<void> {
    if (!this.publisher) throw new Error('RabbitMQ publisher is not connected');
    this.publisher.publish(`${config.RABBITMQ_EXCHANGE}.dead`, 'dead', Buffer.from(JSON.stringify(message)), { persistent: true, contentType: 'application/json', messageId: message.deliveryId, headers: { 'x-failure-reason': reason.slice(0, 500) } });
    await this.publisher.waitForConfirms();
  }

  async consume(handler: (message: NotificationMessage, raw: ConsumeMessage) => Promise<void>): Promise<void> {
    if (!this.consumer) throw new Error('RabbitMQ consumer is not connected');
    await this.consumer.consume(config.RABBITMQ_QUEUE, async raw => {
      if (!raw) return;
      try { await handler(JSON.parse(raw.content.toString()) as NotificationMessage, raw); }
      catch { this.consumer?.nack(raw, false, true); }
    }, { noAck: false });
  }

  ack(raw: ConsumeMessage) { this.consumer?.ack(raw); }
  nack(raw: ConsumeMessage, requeue = true) { this.consumer?.nack(raw, false, requeue); }
  async health(): Promise<boolean> { return Boolean(this.connection && this.publisher && this.consumer); }
  async close(): Promise<void> { await this.consumer?.close(); await this.publisher?.close(); await this.connection?.close(); }
}
