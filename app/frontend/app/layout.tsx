
// import type { Metadata } from "next";
// import { Inter } from "next/font/google";
// import { CopilotKit } from "@copilotkit/react-core";
// import "@copilotkit/react-ui/styles.css";
// import "./globals.css";

// const inter = Inter({
//   subsets: ["latin"],
//   variable: "--font-inter",
// });

// export const metadata: Metadata = {
//   title: "LOCUS",
//   description:
//     "AI-powered location intelligence by Intsemble",
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   return (
//     <html lang="en" className={inter.variable}>
//       <body>
//         <CopilotKit runtimeUrl="/api/copilotkit" agent="locus">
//         {/* <CopilotKit runtimeUrl="/api/copilotkit"> */}
//           {children}
//         </CopilotKit>
//       </body>
//     </html>
//   );
// }



import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LOCUS",
  description: "AI-powered location intelligence by Intsemble",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      {/* Added min-h-screen to ensure the chat interface 
        has full height available on mobile/deployment 
      */}
      <body className="min-h-screen bg-white text-black">
        {/* CRITICAL CONFIGURATION NOTE:
          We point runtimeUrl to our Next.js API route that houses the Vertex Adapter.
          We DO NOT specify 'agent="locus"' here. The Vertex Adapter acts as the 
          default handler. Specifying a name would cause a routing mismatch error.
        */}
        <CopilotKit runtimeUrl="/api/copilotkit">
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}