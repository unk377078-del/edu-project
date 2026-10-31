export const metadata = {
  title: 'منصة الامتحانات الإلكترونية',
  description: 'Online Exam Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
