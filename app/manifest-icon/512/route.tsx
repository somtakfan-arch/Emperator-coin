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
            width: 200,
            height: 200,
            borderRadius: "50%",
            border: "40px solid #0a0a0d",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
