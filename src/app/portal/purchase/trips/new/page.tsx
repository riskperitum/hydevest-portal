"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NewTripPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expectedEnd, setExpectedEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Trip name is required.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in.");
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from("purchase_trips").insert({
      created_by: user.id,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      supplier: supplier.trim() || null,
      expected_end: expectedEnd || null,
      status: "active",
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/portal/purchase/trips");
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link
          href="/portal/purchase/trips"
          className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline mb-4"
        >
          <ArrowLeft size={14} /> Back to trips
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">New trip</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Register a purchase trip before containers and costs are attached.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4"
      >
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Trip name
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="e.g. Tinuolabo"
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            placeholder="Cargo type, notes for finance…"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Origin / location
            </label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Colombia"
            />
          </div>
          <div>
            <label
              htmlFor="supplier"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Supplier
            </label>
            <input
              id="supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Contact or company"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="expectedEnd"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Expected end date
          </label>
          <input
            id="expectedEnd"
            type="date"
            value={expectedEnd}
            onChange={(e) => setExpectedEnd(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving…
              </>
            ) : (
              "Create trip"
            )}
          </button>
          <Link
            href="/portal/purchase/trips"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
