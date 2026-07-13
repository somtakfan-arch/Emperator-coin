import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #e9ff4d, #ff5c9e)",
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            border: "15px solid #0a0a0d",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
