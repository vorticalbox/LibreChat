import type * as t from '~/types';
import messageSchema from '~/schema/message';

/**
 * Creates or returns the Message model using the provided mongoose instance and schema
 */
export function createMessageModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
}
