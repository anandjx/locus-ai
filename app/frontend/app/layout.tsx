
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
      <body className="min-h-screen bg-white text-black">
        {/* CRITICAL CONFIGURATION FIX:
           We MUST set 'agent="locus"' here. 
           
           Why?
           1. Your backend (route.ts) defines: agents: { locus: ... }
           2. Your frontend (page.tsx) asks for: useCoAgent({ name: "locus" })
           
           If you leave this prop out, the chat UI tries to connect to an agent 
           named "default", which doesn't exist on your server, causing the 404 error.
        */}
        <CopilotKit runtimeUrl="/api/copilotkit" agent="locus">
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}