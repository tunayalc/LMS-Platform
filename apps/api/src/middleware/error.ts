
import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const message = err?.message ?? "Internal Server Error";
  if (typeof message === "string" && message.includes("Multipart: Boundary not found")) {
    return res.status(415).json({
      error: "invalid_content_type",
      message: "multipart/form-data with boundary is required."
    });
  }
  console.error(err);
  const status = err?.status ?? 500;
  res.status(status).json({ error: message });
};
