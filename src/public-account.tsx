import { Link } from "react-router-dom";
export default function PublicAccount() {
  return (
    <section className="text-page">
      <h1>Restricted testing area</h1>
      <p>
        Accounts, admin and Pro workspaces are restricted to authorized testing.
      </p>
      <Link to="/tools">Explore free tools</Link>
    </section>
  );
}
