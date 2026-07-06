import './globals.css'
export const metadata = { title: 'HeatPriority', description: 'HeatPriority — tract heat-risk ranking (Mireye)' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
