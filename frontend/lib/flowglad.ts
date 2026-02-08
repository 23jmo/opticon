import Flowglad from "@flowglad/node";

export function flowglad(userId: string) {
  return new Flowglad({
    apiKey: process.env.FLOWGLAD_SECRET_KEY!,
    customerId: userId,
  });
}
