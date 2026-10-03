import type { SenderCatalogue } from '../model/SenderCatalogue';
import type { NodeCatalogue } from './ShareNode';

/** A sender's catalogue as a node asks it: by person id, for the people of one table. */
export function forTable(catalogue: Pick<SenderCatalogue, 'list' | 'open'>, tableId: string): NodeCatalogue {
  return {
    list: (person) => catalogue.list({ tableId, personId: person }),
    open: (person, ref) => catalogue.open({ tableId, personId: person }, ref),
  };
}
