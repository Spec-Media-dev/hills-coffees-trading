import * as React from 'react';

export interface ShipmentCardProps extends React.HTMLAttributes<HTMLElement> {
  shipmentId: string;
  orderReference?: string;
  status?: React.ReactNode;
  eta?: string;
  destination?: string;
  quantity?: string;
  carrier?: string;
  incoterm?: string;
  /** Copy for the amber "you need to act" strip. */
  actionRequired?: string;
  onOpen?: () => void;
}
export declare function ShipmentCard(props: ShipmentCardProps): JSX.Element;
